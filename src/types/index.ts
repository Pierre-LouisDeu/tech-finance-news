/**
 * Core types for Tech Finance News Aggregator
 */

export interface Article {
  id: string;
  title: string;
  url: string;
  content: string;
  publishedAt: Date;
  source: ArticleSource;
  createdAt: Date;
}

export type ArticleSource = 'zonebourse' | 'abcbourse';

export interface ArticleSummary {
  articleId: string;
  shortSummary: string;
  detailedSummary?: string;
  createdAt: Date;
}

export interface ProcessingLog {
  id: number;
  articleId: string;
  stage: ProcessingStage;
  status: ProcessingStatus;
  errorMessage?: string;
  processedAt: Date;
}

export type ProcessingStage = 'scraped' | 'filtered' | 'summarized' | 'pushed';
export type ProcessingStatus = 'success' | 'failed' | 'skipped';

export interface NotionSync {
  articleId: string;
  notionPageId: string;
  syncedAt: Date;
}

export interface KeywordMatch {
  matched: boolean;
  keywords: string[];
  categories: string[];
}

export interface PipelineResult {
  scraped: number;
  filtered: number;
  summarized: number;
  pushed: number;
  errors: number;
  durationMs: number;
}

export interface ScraperConfig {
  rateLimit: number;
  userAgent: string;
  timeout: number;
}

export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  factor: number;
}
