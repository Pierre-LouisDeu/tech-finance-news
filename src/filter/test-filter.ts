/**
 * Filter Module Test Script
 *
 * Run with: npx tsx src/filter/test-filter.ts
 */

import { matchArticle, filterArticles, DEFAULT_FILTER_CONFIG } from './matcher.js';
import { initDatabase, closeDatabase } from '../db/index.js';
import { getArticlesWithEmptyContent, getArticleById } from '../db/queries.js';
import { logger } from '../utils/logger.js';
import type { Article } from '../types/index.js';

// Test articles for validation
const TEST_ARTICLES: Omit<Article, 'id' | 'createdAt'>[] = [
  {
    title: 'NVIDIA annonce de nouveaux GPU pour l\'IA',
    content: 'Le géant des semiconducteurs NVIDIA a présenté sa nouvelle génération de puces GPU destinées au deep learning et à l\'intelligence artificielle.',
    url: 'https://example.com/nvidia-gpu',
    publishedAt: new Date(),
    source: 'abcbourse',
  },
  {
    title: 'Le CAC 40 progresse de 0,5%',
    content: 'L\'indice parisien a clôturé en hausse, porté par les valeurs bancaires et le secteur de l\'énergie.',
    url: 'https://example.com/cac40',
    publishedAt: new Date(),
    source: 'abcbourse',
  },
  {
    title: 'Apple et Microsoft dominent le cloud',
    content: 'Les deux géants de la tech continuent de renforcer leurs positions sur le marché du cloud computing avec Azure et iCloud.',
    url: 'https://example.com/apple-msft',
    publishedAt: new Date(),
    source: 'abcbourse',
  },
  {
    title: 'Tesla réduit ses effectifs de 10%',
    content: 'Le constructeur de véhicules électriques annonce des licenciements tech importants dans le cadre d\'une restructuration.',
    url: 'https://example.com/tesla-layoffs',
    publishedAt: new Date(),
    source: 'abcbourse',
  },
  {
    title: 'Les taux d\'intérêt restent stables',
    content: 'La BCE maintient ses taux directeurs, dans un contexte d\'inflation maîtrisée.',
    url: 'https://example.com/bce-taux',
    publishedAt: new Date(),
    source: 'abcbourse',
  },
];

async function testFilter(): Promise<void> {
  logger.info('Starting filter module test');

  // Test with synthetic articles
  logger.info('=== Testing with synthetic articles ===');

  for (const testData of TEST_ARTICLES) {
    const article: Article = {
      ...testData,
      id: `test-${Date.now()}`,
      createdAt: new Date(),
    };

    const result = matchArticle(article);

    logger.info({
      title: article.title.slice(0, 50),
      matched: result.matched,
      score: result.score,
      keywords: result.matchedKeywords,
      categories: result.matchedCategories,
    });
  }

  // Test with real articles from database
  logger.info('=== Testing with real articles from database ===');

  try {
    initDatabase();

    // Get articles with content
    const db = (await import('../db/index.js')).getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM articles
      WHERE content IS NOT NULL AND content != ''
      ORDER BY published_at DESC
      LIMIT 10
    `);
    const rows = stmt.all() as Array<{
      id: string;
      title: string;
      url: string;
      content: string;
      published_at: string;
      source: string;
      created_at: string;
    }>;

    const realArticles: Article[] = rows.map((row) => ({
      id: row.id,
      title: row.title,
      url: row.url,
      content: row.content,
      publishedAt: new Date(row.published_at),
      source: row.source as 'zonebourse' | 'abcbourse',
      createdAt: new Date(row.created_at),
    }));

    if (realArticles.length === 0) {
      logger.warn('No articles with content found. Run test-content.ts first.');
    } else {
      const { matched, rejected, results } = filterArticles(realArticles);

      logger.info({
        total: realArticles.length,
        matched: matched.length,
        rejected: rejected.length,
      }, 'Filter results');

      logger.info('Matched articles:');
      for (const article of matched) {
        const result = results.get(article.id);
        logger.info({
          title: article.title.slice(0, 60),
          score: result?.score,
          keywords: result?.matchedKeywords.slice(0, 5),
        });
      }

      if (rejected.length > 0) {
        logger.info('Rejected articles:');
        for (const article of rejected.slice(0, 3)) {
          const result = results.get(article.id);
          logger.info({
            title: article.title.slice(0, 60),
            score: result?.score,
          });
        }
      }
    }
  } catch (error) {
    logger.error({ error }, 'Database test failed');
  } finally {
    closeDatabase();
  }

  logger.info('=== Filter Module Test Complete ===');
}

testFilter().catch((error) => {
  logger.fatal({ error }, 'Test failed');
  process.exit(1);
});
