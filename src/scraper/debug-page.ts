/**
 * Debug Zone Bourse Page Structure
 */

import { initBrowser, createPage, navigateTo, closeBrowser } from './browser.js';
import { logger } from '../utils/logger.js';

async function debugPage(): Promise<void> {
  try {
    await initBrowser({ headless: true });
    const page = await createPage();

    const url = 'https://www.zonebourse.com/actualite-bourse/';
    logger.info({ url }, 'Loading page');

    await navigateTo(page, url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);  // Wait longer for dynamic content

    // Get ALL links on the page
    const links = await page.evaluate((): Array<{ href: string; text: string; classes: string }> => {
      return Array.from(document.querySelectorAll('a'))
        .slice(0, 200)
        .map((a) => ({
          href: a.href,
          text: (a.textContent || '').trim().slice(0, 80),
          classes: a.className,
        }));
    });

    // Show all unique URL bases
    const uniqueBases = new Set<string>();
    for (const link of links) {
      const match = link.href.match(/https?:\/\/[^/]+\/[^/]+\//);
      if (match) uniqueBases.add(match[0]);
    }
    logger.info({ bases: Array.from(uniqueBases) }, 'Unique URL bases');

    logger.info({ count: links.length }, 'Found links with "actualite"');

    // Group by pattern
    const patterns: Record<string, number> = {};
    for (const link of links) {
      // Extract pattern from URL
      const match = link.href.match(/zonebourse\.com\/([^?#]+)/);
      if (match?.[1]) {
        const pattern = match[1].split('/').slice(0, 2).join('/');
        patterns[pattern] = (patterns[pattern] || 0) + 1;
      }
    }
    logger.info({ patterns }, 'URL patterns');

    // Show some sample article-like links
    const articleLinks = links.filter(
      (l) =>
        l.href.includes('/actualite/') &&
        !l.href.match(
          /\/(societes|indices|devises|economie|secteurs|taux|ETF|cryptomonnaies|matieres-premieres)\/?$/
        )
    );

    logger.info({ count: articleLinks.length }, 'Potential article links');
    for (const link of articleLinks.slice(0, 10)) {
      logger.info(link, 'Article link');
    }

    // Check for common article container patterns
    const containers = await page.evaluate((): Record<string, number> => {
      const selectors: Record<string, number> = {};
      const toCheck = [
        'article',
        '.card',
        '[class*="card"]',
        '[class*="list"]',
        '[class*="item"]',
        '[class*="news"]',
        '[class*="actu"]',
        '.row',
        '[class*="row"]',
      ];

      for (const sel of toCheck) {
        try {
          selectors[sel] = document.querySelectorAll(sel).length;
        } catch {
          selectors[sel] = 0;
        }
      }
      return selectors;
    });

    logger.info({ containers }, 'Container element counts');

    // Save page HTML for inspection
    const html = await page.content();
    await page.screenshot({ path: './data/debug-economie.png', fullPage: true });

    // Find all elements with article-related classes
    const articleElements = await page.evaluate((): string[] => {
      const elements = document.querySelectorAll('[class*="article"], [class*="news"], [class*="card"]');
      return Array.from(elements)
        .slice(0, 20)
        .map((el) => {
          const tag = el.tagName.toLowerCase();
          const classes = el.className;
          const links = el.querySelectorAll('a').length;
          const text = (el.textContent || '').trim().slice(0, 100);
          return `${tag}.${classes} (${links} links): ${text}`;
        });
    });

    logger.info('Article-like elements:');
    for (const el of articleElements) {
      logger.info(el);
    }

    logger.info('Debug complete - check ./data/debug-economie.png');
  } finally {
    await closeBrowser();
  }
}

debugPage().catch((e) => {
  logger.error({ error: e }, 'Debug failed');
  process.exit(1);
});
