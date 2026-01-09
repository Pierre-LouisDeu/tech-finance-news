/**
 * Keyword Matcher
 *
 * Matches articles against tech keywords and calculates relevance scores
 */

import { TECH_KEYWORDS, type KeywordCategory } from '../config/keywords.js';
import { logger } from '../utils/logger.js';
import type { Article, KeywordMatch } from '../types/index.js';

/**
 * Match result with detailed scoring
 */
export interface MatchResult {
  matched: boolean;
  score: number;
  matchedKeywords: string[];
  matchedCategories: KeywordCategory[];
  details: {
    titleMatches: string[];
    contentMatches: string[];
  };
}

/**
 * Filter configuration
 */
export interface FilterConfig {
  minScore: number;
  titleWeight: number;
  contentWeight: number;
  companyWeight: number;
  themeWeight: number;
  termWeight: number;
}

/**
 * Default filter configuration
 */
export const DEFAULT_FILTER_CONFIG: FilterConfig = {
  minScore: 2,
  titleWeight: 3,
  contentWeight: 1,
  companyWeight: 2,
  themeWeight: 1.5,
  termWeight: 1,
};

/**
 * Normalize text for matching (lowercase, remove accents)
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Check if text contains a keyword (word boundary aware)
 */
function containsKeyword(text: string, keyword: string): boolean {
  const normalizedText = normalizeText(text);
  const normalizedKeyword = normalizeText(keyword);

  // For short keywords (< 4 chars), require word boundaries
  if (normalizedKeyword.length < 4) {
    const regex = new RegExp(`\\b${escapeRegex(normalizedKeyword)}\\b`, 'i');
    return regex.test(normalizedText);
  }

  // For longer keywords, simple includes is sufficient
  return normalizedText.includes(normalizedKeyword);
}

/**
 * Escape regex special characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Find all matching keywords in text
 */
function findMatches(text: string, keywords: readonly string[]): string[] {
  const matches: string[] = [];

  for (const keyword of keywords) {
    if (containsKeyword(text, keyword)) {
      matches.push(keyword);
    }
  }

  return matches;
}

/**
 * Match an article against tech keywords
 */
export function matchArticle(
  article: Article,
  config: FilterConfig = DEFAULT_FILTER_CONFIG
): MatchResult {
  const titleMatches: string[] = [];
  const contentMatches: string[] = [];
  const matchedCategories = new Set<KeywordCategory>();

  let score = 0;

  // Check each category
  for (const [category, keywords] of Object.entries(TECH_KEYWORDS)) {
    const categoryKey = category as KeywordCategory;

    // Get weight for this category
    let categoryWeight: number;
    switch (categoryKey) {
      case 'companies':
        categoryWeight = config.companyWeight;
        break;
      case 'themes':
        categoryWeight = config.themeWeight;
        break;
      case 'terms':
        categoryWeight = config.termWeight;
        break;
      default:
        categoryWeight = 1;
    }

    // Check title
    const titleCategoryMatches = findMatches(article.title, keywords);
    if (titleCategoryMatches.length > 0) {
      titleMatches.push(...titleCategoryMatches);
      matchedCategories.add(categoryKey);
      score += titleCategoryMatches.length * config.titleWeight * categoryWeight;
    }

    // Check content
    const contentCategoryMatches = findMatches(article.content, keywords);
    if (contentCategoryMatches.length > 0) {
      // Only add unique matches not already in title
      const uniqueContentMatches = contentCategoryMatches.filter(
        (m) => !titleCategoryMatches.includes(m)
      );
      contentMatches.push(...uniqueContentMatches);

      if (uniqueContentMatches.length > 0) {
        matchedCategories.add(categoryKey);
      }

      score += contentCategoryMatches.length * config.contentWeight * categoryWeight;
    }
  }

  const allMatches = [...new Set([...titleMatches, ...contentMatches])];

  const result: MatchResult = {
    matched: score >= config.minScore,
    score,
    matchedKeywords: allMatches,
    matchedCategories: Array.from(matchedCategories),
    details: {
      titleMatches: [...new Set(titleMatches)],
      contentMatches: [...new Set(contentMatches)],
    },
  };

  logger.debug(
    {
      articleId: article.id,
      title: article.title.slice(0, 50),
      score: result.score,
      matched: result.matched,
      keywords: result.matchedKeywords.length,
    },
    'Article matched'
  );

  return result;
}

/**
 * Convert MatchResult to KeywordMatch (for database storage)
 */
export function toKeywordMatch(result: MatchResult): KeywordMatch {
  return {
    matched: result.matched,
    keywords: result.matchedKeywords,
    categories: result.matchedCategories,
  };
}

/**
 * Filter multiple articles
 */
export function filterArticles(
  articles: Article[],
  config: FilterConfig = DEFAULT_FILTER_CONFIG
): { matched: Article[]; rejected: Article[]; results: Map<string, MatchResult> } {
  const matched: Article[] = [];
  const rejected: Article[] = [];
  const results = new Map<string, MatchResult>();

  for (const article of articles) {
    const result = matchArticle(article, config);
    results.set(article.id, result);

    if (result.matched) {
      matched.push(article);
    } else {
      rejected.push(article);
    }
  }

  logger.info(
    {
      total: articles.length,
      matched: matched.length,
      rejected: rejected.length,
    },
    'Articles filtered'
  );

  return { matched, rejected, results };
}
