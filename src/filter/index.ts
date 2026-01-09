/**
 * Filter Module
 *
 * Keyword-based and AI-powered article filtering
 */

export {
  matchArticle,
  filterArticles,
  toKeywordMatch,
  DEFAULT_FILTER_CONFIG,
  type MatchResult,
  type FilterConfig,
} from './matcher.js';

export {
  validateWithAi,
  validateArticlesWithAi,
  isAiValidationAvailable,
  type AiValidationResult,
} from './ai-validator.js';

export { TECH_KEYWORDS, type KeywordCategory } from '../config/keywords.js';
